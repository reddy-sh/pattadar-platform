import PattadarKit
import SwiftUI
import PhotosUI

/// Who the app thinks you are, and how to change it.
///
/// This is NOT authentication. The API still trusts an `x-user-id` header, so
/// signing in here is choosing an identity, not proving one. It is written
/// that way on the screen rather than dressed up as a login, because a fake
/// padlock is worse than an honest one — it invites you to treat the app as
/// secure before it is.
enum Identity {
    private static let key = "pattadar.user"
    private static let avatarName = "avatar.jpg"

    /// Saved choice, else the bundled default.
    static func current(default fallback: String) -> String {
        UserDefaults.standard.string(forKey: key) ?? fallback
    }

    static func set(_ user: String) {
        UserDefaults.standard.set(user.trimmingCharacters(in: .whitespaces).lowercased(), forKey: key)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
        removeAvatar()
    }

    static var avatarURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(avatarName)
    }

    static func avatar() -> UIImage? {
        guard let data = try? Data(contentsOf: avatarURL) else { return nil }
        return UIImage(data: data)
    }

    /// Stored on the device only. There is no storage gateway for this client
    /// yet, and a face is not something to upload speculatively.
    static func saveAvatar(_ data: Data) {
        try? data.write(to: avatarURL, options: .atomic)
    }

    static func removeAvatar() {
        try? FileManager.default.removeItem(at: avatarURL)
    }
}

/// Sign in. Shown when no identity has been chosen, and from You → Switch.
///
/// The front door is real now: Cognito's hosted UI, a Google button and an
/// email-and-password form on the founder's own domain. The header trick that
/// used to BE this screen still exists, but as what it always was — a
/// developer's tool — folded away and labelled as one.
struct SignInScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var user = ""
    @State private var checking = false
    @State private var problem = ""
    @State private var devOpen = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("🙏").font(.scaled(40))
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text("Namaste").font(.title2.weight(.semibold))
                            Text("Your land, your records.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, Space.sm)
                }

                Section {
                    PrimaryButton(title: "Sign in", busy: checking) {
                        Task { await signInWithCognito() }
                    }
                } footer: {
                    Text("Opens auth.pattadar.com — sign in with Google or your email. Use the account whose email your records belong to.")
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
                }

                Section {
                    DisclosureGroup("Development", isExpanded: $devOpen) {
                        FormRow(label: "User", text: $user, prompt: "u01", required: false)
                        Button("Continue as this user") { Task { await adoptHeaderUser() } }
                            .disabled(checking || user.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } footer: {
                    // Said plainly. On the local stack this is a real token
                    // from the laptop's own issuer; on the bare dev API it is
                    // the old header, which anyone who knows a user id can use.
                    Text("Developer door: on the local stack this signs you in with tokens from the laptop's own issuer — works offline. Against the bare dev API it falls back to a header. The production gateway accepts neither.")
                }
            }
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    /// The real thing: hosted UI → tokens → the identity the gateway would
    /// derive from those same tokens.
    private func signInWithCognito() async {
        checking = true
        problem = ""
        defer { checking = false }
        do {
            let email = try await CognitoAuth.shared.signIn()
            let id = CognitoAuth.userID(fromEmail: email)
            // Verify the identity reaches the server before adopting it, so a
            // dead tunnel shows here rather than as an empty app.
            app.setUser(id)
            guard await app.load(Queries.dashboard, as: DashboardResponse.self) != nil else {
                problem = app.lastFailure ?? "Signed in, but the server could not be reached."
                return
            }
            Identity.set(id)
            dismiss()
        } catch CognitoAuth.AuthError.cancelled {
            // Closed the sheet. Not an error; nothing to say.
        } catch {
            problem = error.localizedDescription
        }
    }

    private func adoptHeaderUser() async {
        checking = true
        problem = ""
        defer { checking = false }
        let clean = user.trimmingCharacters(in: .whitespaces).lowercased()

        // A LOCAL gateway (always plain http) mints real tokens for this
        // user, so every request after the door travels the production
        // path — and it works with no internet at all. Anywhere else the
        // route does not exist and the old header identity is the fallback.
        if let root = localGatewayRoot(),
           let email = try? await CognitoAuth.shared.signInLocal(gatewayRoot: root, user: clean) {
            let id = CognitoAuth.userID(fromEmail: email)
            app.setUser(id)
            if await app.load(Queries.dashboard, as: DashboardResponse.self) == nil {
                problem = app.lastFailure ?? "Signed in locally, but the server could not be reached."
                return
            }
            Identity.set(id)
            dismiss()
            return
        }

        // Choosing a header identity and holding Cognito tokens for a
        // different one would be two answers to "who are you"; drop the tokens.
        await CognitoAuth.shared.signOut()
        app.setUser(clean)
        if await app.load(Queries.dashboard, as: DashboardResponse.self) == nil {
            problem = app.lastFailure ?? "Could not reach the server."
            return
        }
        Identity.set(clean)
        dismiss()
    }

    /// scheme://host:port of the configured base URL, path dropped — the
    /// local issuer lives at the gateway ROOT, not under the proxy prefix.
    /// Nil on https: production never has a local issuer; don't even ask.
    private func localGatewayRoot() -> URL? {
        let base = app.api.config.baseURL
        guard base.scheme == "http",
              var parts = URLComponents(url: base, resolvingAgainstBaseURL: false)
        else { return nil }
        parts.path = ""
        parts.query = nil
        return parts.url
    }
}
