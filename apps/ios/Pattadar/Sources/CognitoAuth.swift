import AuthenticationServices
import CryptoKit
import Foundation
import PattadarKit
import UIKit

/// Real sign-in: the Cognito hosted UI, spoken to the way Apple intends.
///
/// The SignInScreen has been saying "real sign-in arrives with the Cognito
/// client" since the day it was written. This is that client. The pool, the
/// hosted UI at auth.pattadar.com and the `pattadar-mobile` app client all
/// already exist — the app was the only party not using them.
///
/// The flow is authorization-code + PKCE through `ASWebAuthenticationSession`:
/// the app never sees a password, Google sign-in works because it is a real
/// browser, and the callback is a custom scheme that never leaves the device.
/// Tokens live in the Keychain — not UserDefaults, which is a plist on disk.
///
/// Identity: the gateway derives every owner key as the EMAIL'S LOCAL PART,
/// LOWERCASED (services/gateway/app/auth.py, `_normalize_user_id` — marked
/// byte-identical, do not improve). `userID(fromEmail:)` mirrors that rule, so
/// the id this app adopts after sign-in is exactly the id the gateway would
/// derive from the same token — signing in lands on the same records the dev
/// header pointed at, and switching the base URL to the gateway changes
/// nothing about who you are.
@MainActor
final class CognitoAuth: NSObject {
    static let shared = CognitoAuth()

    // The prod pool's coordinates. Public identifiers, not secrets — they are
    // in every authorize URL a browser sees.
    private static let domain = "auth.pattadar.com"
    private static let clientID = "44gv48ihjlgub7h0lnvjbdmj89"
    private static let redirectURI = "pattadar://auth"
    private static let callbackScheme = "pattadar"

    enum AuthError: LocalizedError {
        /// The person closed the sheet. Not a failure; never shown in red.
        case cancelled
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: "Stopped."
            case .failed(let why): why
            }
        }
    }

    // MARK: - Tokens

    struct Tokens: Codable {
        var accessToken: String
        var idToken: String
        var refreshToken: String?
        var expiresAt: Date
    }

    private(set) var tokens: Tokens?

    /// Held for the whole dance: an `ASWebAuthenticationSession` nobody
    /// retains is deallocated mid-flight and the sheet never appears.
    private var activeSession: ASWebAuthenticationSession?

    var isSignedIn: Bool { tokens != nil }

    /// The verified email, straight out of the ID token. Display only —
    /// nothing security-relevant is decided on an unverified decode here; the
    /// gateway re-verifies the signature on every request it receives.
    var email: String? {
        guard let t = tokens else { return nil }
        return Self.claims(of: t.idToken)["email"] as? String
    }

    private override init() {
        super.init()
        tokens = Keychain.load()
    }

    /// The gateway's identity rule, mirrored: local part of the email,
    /// lowercased. `sankara.telukutla@gmail.com` → `sankara.telukutla`.
    static func userID(fromEmail email: String) -> String {
        var s = email.trimmingCharacters(in: .whitespaces)
        if let at = s.firstIndex(of: "@") { s = String(s[s.startIndex..<at]) }
        return s.trimmingCharacters(in: .whitespaces).lowercased()
    }

    // MARK: - Sign in

    /// Runs the whole dance and returns the signed-in email.
    func signIn() async throws -> String {
        // PKCE: the verifier stays on the device; only its hash travels.
        let verifier = Self.base64URL(Self.randomBytes(32))
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.base64URL(Self.randomBytes(16))

        var authorize = URLComponents()
        authorize.scheme = "https"
        authorize.host = Self.domain
        authorize.path = "/oauth2/authorize"
        authorize.queryItems = [
            .init(name: "response_type", value: "code"),
            .init(name: "client_id", value: Self.clientID),
            .init(name: "redirect_uri", value: Self.redirectURI),
            .init(name: "scope", value: "openid email profile"),
            .init(name: "state", value: state),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "code_challenge", value: challenge),
        ]

        let callback: URL = try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(
                url: authorize.url!,
                callbackURLScheme: Self.callbackScheme
            ) { url, error in
                Task { @MainActor in self.activeSession = nil }
                if let url { cont.resume(returning: url) }
                else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    cont.resume(throwing: AuthError.cancelled)
                } else {
                    cont.resume(throwing: AuthError.failed(error?.localizedDescription ?? "Sign-in failed."))
                }
            }
            // Ephemeral: no cookies survive, so sign-out means what it says —
            // the alternative leaves a hosted-UI session that silently signs
            // the next person in as the last one.
            session.prefersEphemeralWebBrowserSession = true
            session.presentationContextProvider = self
            activeSession = session
            session.start()
        }

        let query = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String { query.first { $0.name == name }?.value ?? "" }
        guard value("state") == state else {
            throw AuthError.failed("The sign-in answer did not match the request.")
        }
        if !value("error").isEmpty {
            throw AuthError.failed(value("error_description").isEmpty ? value("error")
                                                                      : value("error_description"))
        }
        let code = value("code")
        guard !code.isEmpty else { throw AuthError.failed("No authorization code came back.") }

        let fresh = try await Self.tokenCall([
            "grant_type": "authorization_code",
            "client_id": Self.clientID,
            "redirect_uri": Self.redirectURI,
            "code": code,
            "code_verifier": verifier,
        ], keepingRefreshFrom: nil)
        tokens = fresh
        Keychain.save(fresh)

        guard let email = self.email, !email.isEmpty else {
            // The pre-token-generation Lambda injects email into every token;
            // one without it cannot be mapped to records.
            signOutLocally()
            throw AuthError.failed("The account has no email on it.")
        }
        return email
    }

    // MARK: - Staying signed in

    /// An access token good for at least the next minute, refreshing if not.
    /// Nil when signed out, or when the refresh token itself has died — at
    /// which point the person is signed out rather than left with requests
    /// failing one by one.
    func validAccessToken() async -> String? {
        guard let current = tokens else { return nil }
        if current.expiresAt.timeIntervalSinceNow > 60 { return current.accessToken }
        guard let refresh = current.refreshToken else {
            signOutLocally()
            return nil
        }
        do {
            let fresh = try await Self.tokenCall([
                "grant_type": "refresh_token",
                "client_id": Self.clientID,
                "refresh_token": refresh,
            ], keepingRefreshFrom: current)
            tokens = fresh
            Keychain.save(fresh)
            return fresh.accessToken
        } catch let AuthError.failed(reason) where refreshFailureMeansSignedOut(reason) {
            // Cognito's OWN verdict — invalid_grant: the refresh token is
            // revoked or aged out. That, and only that, is a sign-out.
            signOutLocally()
            return nil
        } catch {
            // A dropped connection mid-phone-call, a timeout, a 5xx — the
            // refresh could not run, which says nothing about the token.
            // Keep the session; this request fails, the next one refreshes.
            // Treating weather as revocation deleted a real session and
            // turned every screen into a 401 until a fresh sign-in.
            return nil
        }
    }

    // MARK: - Sign out

    /// Revokes the refresh token (best-effort — signing out on a train must
    /// still work) and forgets everything local.
    func signOut() async {
        if let refresh = tokens?.refreshToken {
            var r = URLRequest(url: URL(string: "https://\(Self.domain)/oauth2/revoke")!)
            r.httpMethod = "POST"
            r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            r.httpBody = Self.form(["token": refresh, "client_id": Self.clientID])
            _ = try? await URLSession.shared.data(for: r)
        }
        signOutLocally()
    }

    private func signOutLocally() {
        tokens = nil
        Keychain.delete()
    }

    // MARK: - Wire

    private struct TokenResponse: Decodable {
        let access_token: String
        let id_token: String
        let refresh_token: String?
        let expires_in: Double
    }

    private static func tokenCall(_ fields: [String: String],
                                  keepingRefreshFrom old: Tokens?) async throws -> Tokens {
        var r = URLRequest(url: URL(string: "https://\(domain)/oauth2/token")!)
        r.httpMethod = "POST"
        r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        r.httpBody = form(fields)

        let (data, response) = try await URLSession.shared.data(for: r)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw AuthError.failed((body?["error"] as? String) ?? "Token exchange answered \(code).")
        }
        let t = try JSONDecoder().decode(TokenResponse.self, from: data)
        return Tokens(
            accessToken: t.access_token,
            idToken: t.id_token,
            // A refresh answer carries no new refresh token; the old one
            // stays valid and must be kept, or the next refresh signs out.
            refreshToken: t.refresh_token ?? old?.refreshToken,
            expiresAt: Date().addingTimeInterval(t.expires_in))
    }

    private static func form(_ fields: [String: String]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return Data(fields.map { key, value in
            "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value)"
        }.joined(separator: "&").utf8)
    }

    /// Unverified claim decode, for display and identity derivation only.
    private static func claims(of jwt: String) -> [String: Any] {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3 else { return [:] }
        var b64 = parts[1].replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64) else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }

    private static func randomBytes(_ count: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return Data(bytes)
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // MARK: - Keychain

    /// One item, one blob. `AfterFirstUnlock` because a background read can
    /// finish while the phone is locked in a pocket.
    private enum Keychain {
        private static var query: [String: Any] {
            [kSecClass as String: kSecClassGenericPassword,
             kSecAttrService as String: "com.rfactory.pattadar",
             kSecAttrAccount as String: "cognito-tokens"]
        }

        static func save(_ tokens: Tokens) {
            guard let data = try? JSONEncoder().encode(tokens) else { return }
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemDelete(query as CFDictionary)
            SecItemAdd(add as CFDictionary, nil)
        }

        static func load() -> Tokens? {
            var get = query
            get[kSecReturnData as String] = true
            get[kSecMatchLimit as String] = kSecMatchLimitOne
            var out: CFTypeRef?
            guard SecItemCopyMatching(get as CFDictionary, &out) == errSecSuccess,
                  let data = out as? Data else { return nil }
            return try? JSONDecoder().decode(Tokens.self, from: data)
        }

        static func delete() {
            SecItemDelete(query as CFDictionary)
        }
    }
}

extension CognitoAuth: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
