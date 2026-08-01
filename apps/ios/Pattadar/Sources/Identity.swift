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

    /// A circular avatar sized for the tab bar.
    ///
    /// A tab item takes a rendered image, not a view, and by default tints it
    /// as a template — which turns a photograph into a solid blue blob. The
    /// `.alwaysOriginal` rendering mode is what makes it show as a picture.
    static func tabAvatar(size: CGFloat = 26) -> UIImage? {
        guard let source = avatar() else { return nil }
        let rect = CGRect(x: 0, y: 0, width: size, height: size)
        let renderer = UIGraphicsImageRenderer(size: rect.size)
        let circular = renderer.image { _ in
            UIBezierPath(ovalIn: rect).addClip()
            // Fill the circle without distorting the face.
            let scale = max(size / source.size.width, size / source.size.height)
            let drawn = CGSize(width: source.size.width * scale, height: source.size.height * scale)
            source.draw(in: CGRect(x: (size - drawn.width) / 2,
                                   y: (size - drawn.height) / 2,
                                   width: drawn.width, height: drawn.height))
        }
        return circular.withRenderingMode(.alwaysOriginal)
    }
}

/// Choose an identity. Shown when none has been chosen, and from You → Switch.
struct SignInScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var user = ""
    @State private var checking = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("🙏").font(.system(size: 40))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Namaste").font(.title2.weight(.semibold))
                            Text("Your land, your records.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 6)
                }

                Section {
                    FormRow(label: "User", text: $user, prompt: "sankara.telukutla", required: true)
                } header: {
                    Text("Who are you?")
                } footer: {
                    // Said plainly. Anyone who knows a user id can read that
                    // user's records until Cognito lands.
                    Text("This build identifies you with a header, not a password — there is no sign-in yet, and anyone who knows a user id can read that user's records. Real sign-in arrives with the Cognito client.")
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(.red).font(.callout) }
                }

                Section {
                    PrimaryButton(title: "Continue", busy: checking,
                                  disabled: user.trimmingCharacters(in: .whitespaces).isEmpty) {
                        Task { await go() }
                    }
                }
            }
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { if user.isEmpty { user = app.api.config.userID } }
        }
    }

    private func go() async {
        checking = true
        problem = ""
        defer { checking = false }
        let clean = user.trimmingCharacters(in: .whitespaces).lowercased()
        // Verify the identity resolves to something before adopting it, so a
        // typo shows here rather than as an empty app.
        app.setUser(clean)
        if await app.load(Queries.dashboard, as: DashboardResponse.self) == nil {
            problem = app.lastFailure ?? "Could not reach the server."
            return
        }
        Identity.set(clean)
        dismiss()
    }
}
